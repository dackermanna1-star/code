package dev.juukulius.particle;

import net.minecraft.util.RandomSource;

/**
 * Client particle budget, set from the client config ("All", "Reduced", "Minimal"). Lives in common code because
 * entity classes spawn their trail particles from {@code tick()} on the client side.
 */
public final class ParticleDensity {
	private static volatile float multiplier = 1.0F;

	private ParticleDensity() {
	}

	public static float multiplier() {
		return multiplier;
	}

	public static void setMultiplier(float value) {
		multiplier = Math.max(0.0F, Math.min(1.0F, value));
	}

	/** Scales a particle count, rounding randomly so low budgets still emit occasionally. */
	public static int scale(int count, RandomSource random) {
		float scaled = count * multiplier;
		int whole = (int) scaled;
		return whole + (random.nextFloat() < scaled - whole ? 1 : 0);
	}
}
