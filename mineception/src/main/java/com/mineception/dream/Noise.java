package com.mineception.dream;

/**
 * Smooth 2D value noise for terrain. Only additions and multiplications (no transcendental functions), so it gives
 * bit-identical results on every machine and the generated levels match between server and clients.
 */
public final class Noise {
	private final long seed;

	public Noise(long seed) {
		this.seed = seed;
	}

	/** Value noise in [0, 1) with a feature size of {@code scale} blocks. */
	public double value(double x, double z, double scale) {
		double fx = x / scale;
		double fz = z / scale;
		int ix = (int) Math.floor(fx);
		int iz = (int) Math.floor(fz);
		double tx = smooth(fx - ix);
		double tz = smooth(fz - iz);
		double a = DreamRandom.hash01(seed, ix, iz, 0);
		double b = DreamRandom.hash01(seed, ix + 1, iz, 0);
		double c = DreamRandom.hash01(seed, ix, iz + 1, 0);
		double d = DreamRandom.hash01(seed, ix + 1, iz + 1, 0);
		double top = a + (b - a) * tx;
		double bottom = c + (d - c) * tx;
		return top + (bottom - top) * tz;
	}

	/** Fractal sum of {@code octaves} value-noise layers, normalized to [0, 1). */
	public double fbm(double x, double z, double scale, int octaves) {
		double sum = 0.0;
		double amplitude = 1.0;
		double total = 0.0;
		double s = scale;
		for (int i = 0; i < octaves; i++) {
			sum += amplitude * new Noise(seed + i * 0x5851F42D4C957F2DL).value(x, z, s);
			total += amplitude;
			amplitude *= 0.5;
			s *= 0.5;
		}
		return sum / total;
	}

	private static double smooth(double t) {
		return t * t * (3.0 - 2.0 * t);
	}
}
