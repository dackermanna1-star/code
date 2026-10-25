package com.godforge.util;

/** Cheap, deterministic value noise used to give craters and fissures organic edges. */
public final class Noise {
	private Noise() {
	}

	private static float hash(long seed, int x, int y, int z) {
		long h = seed * 0x9E3779B97F4A7C15L;
		h ^= x * 0x632BE59BD9B4E019L;
		h ^= y * 0x85157AF5L;
		h ^= z * 0xC2B2AE3D27D4EB4FL;
		h ^= h >>> 31;
		h *= 0xBF58476D1CE4E5B9L;
		h ^= h >>> 29;
		return ((h >>> 40) & 0xFFFFFF) / (float) 0xFFFFFF;
	}

	private static float smooth(float t) {
		return t * t * (3 - 2 * t);
	}

	/** Smooth 3D value noise in [-1, 1]. */
	public static float noise3(long seed, double x, double y, double z) {
		int x0 = (int) Math.floor(x);
		int y0 = (int) Math.floor(y);
		int z0 = (int) Math.floor(z);
		float fx = smooth((float) (x - x0));
		float fy = smooth((float) (y - y0));
		float fz = smooth((float) (z - z0));
		float c000 = hash(seed, x0, y0, z0);
		float c100 = hash(seed, x0 + 1, y0, z0);
		float c010 = hash(seed, x0, y0 + 1, z0);
		float c110 = hash(seed, x0 + 1, y0 + 1, z0);
		float c001 = hash(seed, x0, y0, z0 + 1);
		float c101 = hash(seed, x0 + 1, y0, z0 + 1);
		float c011 = hash(seed, x0, y0 + 1, z0 + 1);
		float c111 = hash(seed, x0 + 1, y0 + 1, z0 + 1);
		float x00 = c000 + (c100 - c000) * fx;
		float x10 = c010 + (c110 - c010) * fx;
		float x01 = c001 + (c101 - c001) * fx;
		float x11 = c011 + (c111 - c011) * fx;
		float y0v = x00 + (x10 - x00) * fy;
		float y1v = x01 + (x11 - x01) * fy;
		return (y0v + (y1v - y0v) * fz) * 2.0F - 1.0F;
	}

	/** Two-octave noise sampled on the unit direction of an offset (used for crater rims). */
	public static float direction(long seed, double dx, double dy, double dz, double frequency) {
		double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (len < 1.0E-6) {
			return 0.0F;
		}
		double nx = dx / len * frequency;
		double ny = dy / len * frequency;
		double nz = dz / len * frequency;
		return noise3(seed, nx, ny, nz) * 0.7F + noise3(seed + 17, nx * 2.3, ny * 2.3, nz * 2.3) * 0.3F;
	}

	public static float hash01(long seed, int x, int y, int z) {
		return hash(seed, x, y, z);
	}
}
