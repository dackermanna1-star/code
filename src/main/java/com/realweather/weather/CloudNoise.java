package com.realweather.weather;

/**
 * Deterministic, periodic 2D value noise that defines the large-scale cloud field.
 *
 * <p>The exact same algorithm is implemented in GLSL ({@code assets/realweather/shaders/include/rw_cloud_noise.glsl}),
 * so the server (storm cells and rain bands), the client (rain intensity, in-cloud fog) and the GPU (volumetric
 * clouds and cloud shadows) all agree on where the clouds are. All integer math uses wrapping 32-bit arithmetic
 * and logical shifts, which behave identically in Java {@code int} and GLSL {@code uint}.
 *
 * <p>Coordinates are expressed in "noise space": world X/Z minus the accumulated wind offset. The field repeats
 * every {@link #PERIOD} blocks so that coordinates can always be wrapped into a small range and keep full float
 * precision on the GPU.
 */
public final class CloudNoise {
	public static final int PERIOD = 1 << 17;
	public static final int SEED_BASE = 0x5EED;
	public static final int SEED_DETAIL = 0x0DE7;

	private CloudNoise() {
	}

	public static int hash(int x, int y, int seed) {
		int h = seed + x * 374761393 + y * 668265263;
		h = (h ^ (h >>> 13)) * 1274126177;
		return h ^ (h >>> 16);
	}

	private static float lattice(int x, int y, int mask, int seed) {
		return (hash(x & mask, y & mask, seed) & 0xFFFFFF) / 16777216.0F;
	}

	/**
	 * Value noise in [0, 1] with a lattice cell of {@code 1 << cellShift} blocks.
	 */
	public static float valueNoise(double x, double z, int cellShift, int seed) {
		double cell = 1 << cellShift;
		int mask = (PERIOD >> cellShift) - 1;
		double gx = x / cell;
		double gz = z / cell;
		double fx0 = Math.floor(gx);
		double fz0 = Math.floor(gz);
		int ix = (int) fx0;
		int iz = (int) fz0;
		float fx = (float) (gx - fx0);
		float fz = (float) (gz - fz0);
		float ux = fx * fx * (3.0F - 2.0F * fx);
		float uz = fz * fz * (3.0F - 2.0F * fz);
		float a = lattice(ix, iz, mask, seed);
		float b = lattice(ix + 1, iz, mask, seed);
		float c = lattice(ix, iz + 1, mask, seed);
		float d = lattice(ix + 1, iz + 1, mask, seed);
		float ab = a + (b - a) * ux;
		float cd = c + (d - c) * ux;
		return ab + (cd - ab) * uz;
	}

	/**
	 * Low-frequency cloud "weather map" in [0, 1]. Values near 1 are where clouds are thickest.
	 */
	public static float base(double x, double z) {
		return 0.50F * valueNoise(x, z, 9, SEED_BASE)
			+ 0.32F * valueNoise(x + 217.0, z - 131.0, 8, SEED_BASE + 1013)
			+ 0.18F * valueNoise(x - 71.0, z + 293.0, 7, SEED_BASE + 2026);
	}

	/**
	 * Remaps the base noise by the current cloud cover: at cover 1 the sky is fully overcast, at small cover
	 * only the highest peaks of the field produce (isolated) clouds.
	 */
	public static float coverage(float base, float cover) {
		if (cover <= 0.001F) {
			return 0.0F;
		}
		float threshold = 0.80F - 0.68F * cover;
		float softness = 0.10F + 0.25F * cover;
		float v = (base - threshold) / softness;
		return v <= 0.0F ? 0.0F : Math.min(v, 1.0F);
	}

	public static float coverageAt(double x, double z, float cover) {
		return coverage(base(x, z), cover);
	}

	public static double wrap(double v) {
		double r = v % PERIOD;
		return r < 0.0 ? r + PERIOD : r;
	}
}
